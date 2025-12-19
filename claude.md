# CLAUDE.md – Project Guide

**Note**: This project uses [bd (beads)](https://github.com/steveyegge/beads) for issue tracking. Use `bd` commands instead of markdown TODOs. See AGENTS.md for workflow details.

This repo is designed to be used with **Claude Code** and several MCP servers.

When working in this project, you MUST:

- Make a short plan before writing or editing code.
- Keep changes minimal and focused on the requested task (no unnecessary refactors).
- Use all available MCPs: `sequential-thinking`, `ref`, `astrodocs`, `deepwiki`, `octocode`, `playwright` if needed.
- Ask for clarification if requirements seem ambiguous.

---

## 1. Project Overview

- Framework: **Astro**
- Language: **TypeScript / JavaScript**
- Primary goal: Web app served via `npm run dev`.

When in doubt, first **read existing files** and summarize what’s already here before making changes.

---

## 2. Available MCP Tools

You have access to these MCP servers. Prefer using them rather than writing large amounts of code blindly.

### `sequential-thinking`
- Use this first to:
  - Break tasks into clear steps.
  - Create a short plan before coding.
  - Maintain checklists for multi-step changes.

### `ref`
- Use to:
  - Locate and reference important files, docs, and prior decisions.
  - Keep track of where key logic lives.
  - Cross-link specs, tickets, and docs as needed.

### `astrodocs`
- Use whenever you:
  - Add or update routes, endpoints, or components.
  - Need correct Astro syntax or best practices.
  - Work with Astro server/API endpoints.

### `deepwiki`
- Use to:
  - Get background on concepts, patterns, or libraries.
  - Clarify architecture or domain ideas before coding.

### `octocode`
- Use to:
  - Create, edit, and refactor project files.
  - Apply planned changes across multiple files.
  - Keep diffs small and focused on the current task.

### `playwright` (if needed)
- Use only when:
  - You need browser-based automation or scraping.
  - You must verify UI flows via automated navigation.

---

## 3. Commands

### Install dependencies

```bash
npm install
