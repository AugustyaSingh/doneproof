# Project Plan: DoneProof Web Integration

## Objective
Transition DoneProof from a CLI-only tool to a web-accessible verification platform. This involves building a backend API using FastAPI and a minimalist frontend dashboard to visualize verification evidence.

## Tech Stack
- **Backend**: FastAPI (Python)
- **Frontend**: HTML5, Tailwind CSS (for minimalist styling), and Vanilla JavaScript
- **API Communication**: JSON over HTTP

---

## Implementation Roadmap

### Phase 1: FastAPI Backend Development
The goal is to expose the existing `verify_task` logic via a REST API.

- [x] **Setup FastAPI Environment**: Install `fastapi` and `uvicorn`.
- [x] **Create Verification Endpoint**:
    - Implement a `POST /verify` endpoint.
    - Accept a JSON payload containing the `task` object and an optional `base_dir`.
    - Return the result of `verify_task` as a JSON response.
- [x] **Error Handling**: Implement global exception handlers to catch `ValueError` from the verifier and return them as `400 Bad Request` responses with clear messages.
- [x] **CORS Configuration**: Enable Cross-Origin Resource Sharing to allow the frontend to communicate with the API.

### Phase 2: Minimalist Frontend Dashboard
The goal is to create a clean, intuitive interface for uploading tasks and viewing evidence.

- [x] **Upload Interface**:
    - Create a simple page with a file upload zone for `task.json`.
    - Implement a "Raw JSON" text area for quick copy-pasting of task contracts.
- [x] **Results Visualization**:
    - **Status Header**: Dynamic badge (Green/Yellow/Red) based on the `status` field.
    - **Evidence Table**: A clean table displaying each check, its result (✅/❌), and the associated evidence.
    - **Claim vs. Reality**: A section displaying the `agent_claim` alongside the actual verification result.
- [x] **State Management**: Use JavaScript to handle the API request and update the DOM without page reloads.

### Phase 3: Integration & Workflow
Connecting the pieces into a seamless user experience.

- [x] **Frontend-Backend Wiring**: Connect the upload button to the `/verify` endpoint.
- [x] **Loading States**: Add a loading spinner/indicator while the server processes the verification.
- [x] **Responsive Design**: Ensure the dashboard is usable on both desktop and mobile browsers.

### Phase 4: Verification & Polish
- [x] **Integration Testing**: Verify that various `task.json` examples (Pass, Partial, Fail) render correctly in the UI.
- [x] **UI/UX Refinement**: Polish typography and spacing using Tailwind CSS for a "modern tool" aesthetic.
- [x] **Documentation**: Update `README.md` with instructions on how to start the server and access the dashboard.

---

## Success Criteria
1. A user can upload a `task.json` via a web browser.
2. The system returns a `VERIFIED`, `PARTIAL`, or `FAILED` status in $< 2$ seconds.
3. The evidence table accurately reflects the results returned by the `verifier.py` engine.
4. The UI is minimalist, clean, and requires no prior technical knowledge to interpret.
