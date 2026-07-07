# From Code to Shared Understanding

How Workspai transforms projects and repositories into workspace intelligence for developers, CI, and AI agents.

This Mermaid diagram is kept in the internal documentation because GitHub renders it correctly. The main npm README uses a PNG version of the same diagram so it remains visible on npm package pages.

```mermaid
flowchart TB

    Code["Code & Repositories"]
    Projects["Projects"]
    Workspace["Workspace"]

    Code --> Projects
    Projects --> Workspace

    subgraph Intelligence["Workspace Intelligence"]
        Model["Workspace Model"]
        Context["Agent Context"]
        Impact["Impact Analysis"]
        Verify["Verification"]
        Evidence["Evidence & Gates"]
    end

    Workspace --> Model
    Workspace --> Context
    Workspace --> Impact
    Workspace --> Verify
    Workspace --> Evidence

    Model --> Dev["Developers"]
    Model --> CI["CI"]
    Model --> Agents["AI Agents"]

    Context --> Agents

    Impact --> Dev
    Impact --> CI

    Verify --> CI
    Verify --> Agents
    Evidence --> Dev
    Evidence --> CI
    Evidence --> Agents
```
