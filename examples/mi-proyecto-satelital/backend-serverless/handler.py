"""Local Sentinel-2 viewer. Credentials stay on the server; no agricultural persistence."""
import importlib
import json
import logging
import math
import hmac
import os
import re
from datetime import date
from functools import lru_cache
from pathlib import Path

LOGGER = logging.getLogger(__name__)
COLLECTION = "COPERNICUS/S2_SR_HARMONIZED"
KEY_PATH = Path(os.environ.get("GEE_KEY_FILE") or Path(__file__).resolve().parent / "credenciales-gee.json")
INDICES = {
    "NDVI": {"bands": ["B8", "B4"], "formula": "(B8-B4)/(B8+B4)",
             "palette": ["8c510a", "f6e8c3", "1a9850"]},
    "NDWI": {"bands": ["B3", "B8"], "formula": "(B3-B8)/(B3+B8)",
             "palette": ["a6611a", "f5f5f5", "0571b0"]},
}


class ClientError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message


def origins():
    return {value.strip() for value in os.environ.get(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174"
    ).split(",") if value.strip()}


def response(status, payload, origin):
    headers = {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
               "Vary": "Origin", "X-Content-Type-Options": "nosniff"}
    if origin in origins():
        headers.update({"Access-Control-Allow-Origin": origin,
                        "Access-Control-Allow-Methods": "GET, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type",
                        "Access-Control-Max-Age": "600"})
    return {"statusCode": status, "headers": headers,
            "body": "" if status == 204 else json.dumps(payload, ensure_ascii=False)}


def parse_query(query):
    if set(query) - {"index", "start", "end", "cloud", "bbox"}:
        raise ValueError("Parámetros desconocidos. Usa index, start, end, cloud y bbox.")
    index = query.get("index", "NDVI")
    if index not in INDICES:
        raise ValueError("index debe ser NDVI o NDWI (McFeeters).")
    for field in ("start", "end"):
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", query.get(field, "")):
            raise ValueError("start y end deben usar YYYY-MM-DD.")
    start, end = date.fromisoformat(query["start"]), date.fromisoformat(query["end"])
    if start < date(2017, 3, 28) or not 0 < (end - start).days <= 366:
        raise ValueError("Usa un período de 1–366 días desde 2017-03-28; end es exclusivo.")
    cloud = float(query.get("cloud", "30"))
    if not math.isfinite(cloud) or not 0 <= cloud <= 100:
        raise ValueError("cloud debe estar entre 0 y 100.")
    bbox = [float(value) for value in query.get("bbox", "").split(",")]
    if len(bbox) != 4 or not all(math.isfinite(value) for value in bbox):
        raise ValueError("bbox debe ser oeste,sur,este,norte en grados WGS84.")
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -85 <= south < north <= 85):
        raise ValueError("bbox inválido; no se admite cruce del antimeridiano.")
    if east - west > 1 or north - south > 1:
        raise ValueError("Acerca el mapa: cada lado del área debe abarcar como máximo 1 grado.")
    return {"index": index, "start": start.isoformat(), "end": end.isoformat(),
            "cloud": cloud, "bbox": bbox}


@lru_cache(maxsize=1)
def initialize_earth_engine():
    # Lazy initialization lets validation/OPTIONS work without touching the key or network.
    ee = importlib.import_module("ee")
    key = json.loads(KEY_PATH.read_text(encoding="utf-8"))
    if key.get("type") != "service_account" or not key.get("client_email") or not key.get("project_id"):
        raise ValueError("Invalid service account configuration")
    credentials = ee.ServiceAccountCredentials(key["client_email"], str(KEY_PATH))
    ee.Initialize(credentials=credentials, project=os.environ.get("EE_PROJECT_ID") or key["project_id"])
    ee.data.setDeadline(20_000)
    return ee


def scene_index(image, index):
    # SCL: retain dark pixels, vegetation, bare ground, water, low-probability/unclassified.
    # Remove nodata, saturation, shadows, medium/high clouds, cirrus and snow/ice.
    mask = image.select("SCL").remap([2, 4, 5, 6, 7], [1, 1, 1, 1, 1], 0).eq(1)
    return image.updateMask(mask).normalizedDifference(INDICES[index]["bands"]).rename(index)


def render_map(ee, options):
    region = ee.Geometry.Rectangle(options["bbox"], proj="EPSG:4326", geodesic=False)
    collection = (ee.ImageCollection(COLLECTION).filterBounds(region)
                  .filterDate(options["start"], options["end"])
                  .filter(ee.Filter.lte("CLOUDY_PIXEL_PERCENTAGE", options["cloud"])))
    count = collection.size().getInfo()
    if count == 0:
        raise ClientError(404, "NO_SCENES", "No hay escenas para el área, fechas y nubosidad seleccionadas.")
    index = options["index"]
    image = collection.map(lambda scene: scene_index(scene, index)).median().clip(region)
    visualization = {"min": -1, "max": 1, "palette": INDICES[index]["palette"]}
    tiles = image.getMapId(visualization)
    return {"tileUrl": tiles["tile_fetcher"].url_format, "index": index,
            "formula": INDICES[index]["formula"], "collection": COLLECTION,
            "start": options["start"], "endExclusive": options["end"], "bbox": options["bbox"],
            "maxCloudPercentage": options["cloud"], "sceneCount": count,
            "composite": "median_of_per_scene_indices", "visualization": visualization,
            "attribution": "Sentinel-2 / Copernicus · Google Earth Engine",
            "note": "El número de escenas no garantiza píxeles válidos tras aplicar la máscara."}


def procesar_sentinel(event, context):
    headers = {key.lower(): value for key, value in (event.get("headers") or {}).items()}
    origin = headers.get("origin", "")
    if origin and origin not in origins():
        return response(403, {"error": {"code": "ORIGIN_DENIED", "message": "Origen no permitido."}}, origin)
    method = event.get("httpMethod", "GET")
    if method == "OPTIONS":
        return response(204, None, origin)
    internal_token = os.environ.get("SAPHI_GEE_INTERNAL_TOKEN")
    if internal_token and not hmac.compare_digest(headers.get("x-saphi-internal-token", ""), internal_token):
        return response(403, {"error": {"code": "INTERNAL_ACCESS_REQUIRED", "message": "Acceso interno requerido."}}, origin)
    if method != "GET":
        return response(405, {"error": {"code": "METHOD_NOT_ALLOWED", "message": "Usa GET."}}, origin)
    multi = event.get("multiValueQueryStringParameters") or {}
    if any(len(values) != 1 for values in multi.values()):
        return response(400, {"error": {"code": "INVALID_QUERY", "message": "No repitas parámetros."}}, origin)
    try:
        options = parse_query(event.get("queryStringParameters") or {})
    except (ValueError, TypeError, OverflowError):
        return response(400, {"error": {"code": "INVALID_QUERY", "message":
            "Revisa índice, fechas YYYY-MM-DD (1–366 días), cloud 0–100 y bbox oeste,sur,este,norte con lados de hasta 1 grado."}}, origin)
    try:
        ee = initialize_earth_engine()
    except Exception as error:
        LOGGER.error("Earth Engine initialization failed (%s)", type(error).__name__)
        return response(503, {"error": {"code": "GEE_CONFIGURATION", "message":
            "No se pudo iniciar Earth Engine. Revisa la llave local, registro del proyecto, API y permisos."}}, origin)
    try:
        return response(200, render_map(ee, options), origin)
    except ClientError as error:
        return response(error.status, {"error": {"code": error.code, "message": error.message}}, origin)
    except Exception as error:
        LOGGER.error("Earth Engine map request failed (%s)", type(error).__name__)
        return response(502, {"error": {"code": "GEE_REQUEST_FAILED", "message":
            "Earth Engine no pudo generar las teselas. Revisa acceso, cuota, conexión o reduce el área/período."}}, origin)
