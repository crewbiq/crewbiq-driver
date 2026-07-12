from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "index.html").read_text(encoding="utf-8")


def function_body(name: str) -> str:
    marker = f"function {name}("
    start = INDEX.index(marker)
    depth = 0
    brace = None
    for pos in range(INDEX.index("(", start), len(INDEX)):
        char = INDEX[pos]
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                brace = INDEX.index("{", pos)
                break
    assert brace is not None
    depth = 0
    for pos in range(brace, len(INDEX)):
        char = INDEX[pos]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return INDEX[start : pos + 1]
    raise AssertionError(f"Could not extract function {name}")


def test_truck_edit_conflict_does_not_create_duplicate() -> None:
    body = function_body("saveTruckForm")

    assert "generateFleetEntityId('truck')" in body
    assert "('truck_'+Date.now())" not in body
    assert "mode === 'edit' && idx < 0" in body
    assert "showFleetFormConflict('truck'" in body
    assert "return;" in body[body.index("mode === 'edit' && idx < 0") : body.index("var entry =")]
    assert "if(mode === 'edit') list[idx]=entry; else list.push(entry);" in body


def test_driver_profile_edit_conflict_does_not_create_duplicate() -> None:
    body = function_body("saveDriverForm")

    assert "generateFleetEntityId('driverProfile')" in body
    assert "('drv_'+Date.now())" not in body
    assert "mode === 'edit' && idx < 0" in body
    assert "showFleetFormConflict('driverProfile'" in body
    assert "return;" in body[body.index("mode === 'edit' && idx < 0") : body.index("var truckEl =")]
    assert "if(mode === 'edit') list[idx]=entry; else list.push(entry);" in body


def test_restore_defers_fleet_arrays_while_form_is_active() -> None:
    body = function_body("applyOwnerSyncData")

    assert "var deferFleetArrays = hasActiveFleetForm();" in body
    assert "Array.isArray(ownerData.trucks) && !deferFleetArrays" in body
    assert "Array.isArray(ownerData.driverProfiles) && !deferFleetArrays" in body
    assert "skippedFleetArrays" in body
    assert "Cloud fleet restore paused while this edit is open" in body


def test_default_truck_waits_for_restore_settlement() -> None:
    body = function_body("ensureDefaultTruckFromDriver")
    restore = function_body("restoreSession")

    assert "if(!_fleetRestoreSettled) return;" in body
    assert "setFleetRestoreSettled(false);" in restore
    assert "setFleetRestoreSettled(true);" in restore
    assert "setFleetRestoreSettled(true);" in INDEX[INDEX.index("} else {", INDEX.index("const _savedSession")) :]
