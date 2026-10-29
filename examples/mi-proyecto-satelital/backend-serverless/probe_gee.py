"""Probe the real provider without printing keys, project IDs, tokens or tile URLs."""
import json
import sys
import handler

try:
    ee = handler.initialize_earth_engine()
    count = (ee.ImageCollection(handler.COLLECTION)
             .filterDate("2026-09-01", "2026-10-01").limit(1).size().getInfo())
    print(json.dumps({"status": "connected", "collectionAccessible": count > 0}))
except Exception as error:
    message = str(error).lower()
    reason = "authentication_or_provider_error"
    if "registered" in message or "not signed up" in message:
        reason = "earth_engine_project_registration_required"
    elif "serviceusage" in message or "service usage" in message:
        reason = "service_usage_permission_required"
    elif "earthengine.computations.create" in message:
        reason = "earth_engine_computation_permission_required"
    elif "earthengine.maps.create" in message:
        reason = "earth_engine_map_permission_required"
    elif "permission" in message or "403" in message:
        reason = "earth_engine_permission_denied"
    elif isinstance(error, FileNotFoundError):
        reason = "credential_file_missing"
    print(json.dumps({"status": "blocked", "reason": reason, "errorType": type(error).__name__}))
    sys.exit(1)
