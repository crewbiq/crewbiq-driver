# crewbiq-driver
CrewBIQ Driver App by CrewBIQ Technologies

## Current Owner/Fleet Support

Deployed on 2026-05-30.

The Driver PWA now includes the first restored FleetIQ owner-operator layer:

- Fleet and Drivers pages are enabled for the fleet role.
- Loads can be assigned to a specific truck.
- Fuel, DEF, service, and weekly deductions are stored per truck.
- Home REAL NET and Fleet Dashboard calculate owner results from:
  gross, dispatch fee, driver pay, fuel/DEF, service, and deductions.
- A default truck is created from the driver profile on first launch when no truck exists yet.
- Orchestrator mirror sync includes owner data:
  trucks, driver profiles, fuel logs, service logs, deduction templates, and weekly deductions.

Google Apps Script remains the primary sync path. Orchestrator sync is a parallel mirror.
