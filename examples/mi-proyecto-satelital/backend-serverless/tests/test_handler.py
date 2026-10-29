import json
import unittest
from unittest.mock import MagicMock, patch
import handler

QUERY = {"index": "NDVI", "start": "2026-09-01", "end": "2026-10-01",
         "cloud": "30", "bbox": "-71.8,-35.6,-71.5,-35.3"}


def event(query=None, origin="http://localhost:5174", method="GET"):
    return {"httpMethod": method, "headers": {"Origin": origin},
            "queryStringParameters": QUERY.copy() if query is None else query}


class QueryTests(unittest.TestCase):
    def test_valid_dates_cloud_and_coordinates(self):
        result = handler.parse_query(QUERY)
        self.assertEqual(result["bbox"], [-71.8, -35.6, -71.5, -35.3])
        self.assertEqual(result["cloud"], 30)

    def test_invalid_queries(self):
        for change in ({"index": "NDMI"}, {"start": "20260901"}, {"end": "2026-09-01"},
                       {"cloud": "NaN"}, {"cloud": "101"}, {"bbox": "-72,-36,-70,-35"},
                       {"bbox": "NaN,0,1,1"}, {"bbox": "0,0,0,1"}, {"bbox": "1,2,3"},
                       {"start": "2024-01-01"}, {"url": "https://example.test"}):
            with self.subTest(change=change), self.assertRaises((ValueError, TypeError)):
                handler.parse_query({**QUERY, **change})


class HandlerTests(unittest.TestCase):
    def test_options_never_initializes_or_reads_credentials(self):
        with patch.object(handler, "initialize_earth_engine") as initialize:
            result = handler.procesar_sentinel(event(method="OPTIONS"), None)
        self.assertEqual(result["statusCode"], 204)
        self.assertEqual(result["headers"]["Access-Control-Allow-Origin"], "http://localhost:5174")
        initialize.assert_not_called()

    def test_unapproved_origin_is_rejected_without_wildcard(self):
        with patch.object(handler, "initialize_earth_engine") as initialize:
            result = handler.procesar_sentinel(event(origin="https://example.test"), None)
        self.assertEqual(result["statusCode"], 403)
        self.assertNotIn("Access-Control-Allow-Origin", result["headers"])
        initialize.assert_not_called()

    def test_invalid_input_is_rejected_before_initialization(self):
        with patch.object(handler, "initialize_earth_engine") as initialize:
            result = handler.procesar_sentinel(event({}), None)
        self.assertEqual(result["statusCode"], 400)
        initialize.assert_not_called()

    def test_repeated_parameters_and_wrong_method(self):
        request = event()
        request["multiValueQueryStringParameters"] = {"index": ["NDVI", "NDWI"]}
        self.assertEqual(handler.procesar_sentinel(request, None)["statusCode"], 400)
        self.assertEqual(handler.procesar_sentinel(event(method="POST"), None)["statusCode"], 405)

    def test_configuration_failure_does_not_expose_exception_text(self):
        with patch.object(handler, "initialize_earth_engine", side_effect=RuntimeError("private-key-content")):
            result = handler.procesar_sentinel(event(), None)
        self.assertEqual(result["statusCode"], 503)
        self.assertNotIn("private-key-content", result["body"])

    def test_earth_engine_failure_does_not_expose_sdk_details(self):
        with patch.object(handler, "initialize_earth_engine", return_value=object()), \
             patch.object(handler, "render_map", side_effect=RuntimeError("credential-detail")):
            result = handler.procesar_sentinel(event(), None)
        self.assertEqual(result["statusCode"], 502)
        self.assertNotIn("credential-detail", result["body"])

    def test_no_scenes_is_not_a_fake_tile_url(self):
        with patch.object(handler, "initialize_earth_engine", return_value=object()), \
             patch.object(handler, "render_map", side_effect=handler.ClientError(404, "NO_SCENES", "Sin escenas")):
            result = handler.procesar_sentinel(event(), None)
        self.assertEqual(result["statusCode"], 404)
        self.assertNotIn("tileUrl", json.loads(result["body"]))

    def test_success_keeps_cors_and_no_store(self):
        with patch.object(handler, "initialize_earth_engine", return_value=object()), \
             patch.object(handler, "render_map", return_value={"tileUrl": "https://earthengine.googleapis.com/test/{z}/{x}/{y}"}):
            result = handler.procesar_sentinel(event(), None)
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(result["headers"]["Cache-Control"], "no-store")
        self.assertIn("tileUrl", json.loads(result["body"]))


class ProcessingTests(unittest.TestCase):
    def test_deadline_is_set_after_sdk_initialization(self):
        handler.initialize_earth_engine.cache_clear()
        ee = MagicMock()
        key = MagicMock()
        key.read_text.return_value = json.dumps({"type": "service_account", "client_email": "test@example.test", "project_id": "test-project"})
        calls = MagicMock()
        calls.attach_mock(ee.Initialize, "initialize")
        calls.attach_mock(ee.data.setDeadline, "deadline")
        try:
            with patch.object(handler, "KEY_PATH", key), patch.object(handler.importlib, "import_module", return_value=ee):
                handler.initialize_earth_engine()
            self.assertEqual([call[0] for call in calls.mock_calls], ["initialize", "deadline"])
        finally:
            handler.initialize_earth_engine.cache_clear()

    def test_internal_token_protects_private_provider(self):
        with patch.dict(handler.os.environ, {"SAPHI_GEE_INTERNAL_TOKEN": "test-only-token"}):
            result = handler.procesar_sentinel(event(), None)
        self.assertEqual(result["statusCode"], 403)
        self.assertEqual(json.loads(result["body"])["error"]["code"], "INTERNAL_ACCESS_REQUIRED")

    def test_band_selection_and_scene_mask(self):
        for index, bands in (("NDVI", ["B8", "B4"]), ("NDWI", ["B3", "B8"])):
            image = MagicMock()
            handler.scene_index(image, index)
            image.select.assert_called_once_with("SCL")
            image.updateMask.return_value.normalizedDifference.assert_called_once_with(bands)
            image.updateMask.return_value.normalizedDifference.return_value.rename.assert_called_once_with(index)

    def test_collection_range_cloud_and_median_composite(self):
        ee = MagicMock()
        collection = ee.ImageCollection.return_value
        collection.filterBounds.return_value = collection
        collection.filterDate.return_value = collection
        collection.filter.return_value = collection
        collection.size.return_value.getInfo.return_value = 4
        composite = collection.map.return_value.median.return_value.clip.return_value
        composite.getMapId.return_value = {"tile_fetcher": MagicMock(url_format="https://earthengine.googleapis.com/test/{z}/{x}/{y}")}
        result = handler.render_map(ee, handler.parse_query(QUERY))
        ee.ImageCollection.assert_called_once_with(handler.COLLECTION)
        collection.filterDate.assert_called_once_with("2026-09-01", "2026-10-01")
        ee.Filter.lte.assert_called_once_with("CLOUDY_PIXEL_PERCENTAGE", 30)
        self.assertEqual(result["sceneCount"], 4)
        self.assertEqual(result["composite"], "median_of_per_scene_indices")
        self.assertEqual(result["visualization"]["min"], -1)


if __name__ == "__main__":
    unittest.main()
