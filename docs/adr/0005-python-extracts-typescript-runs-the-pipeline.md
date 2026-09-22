# Python extracts, TypeScript runs the pipeline, and they share one store

Extraction (reading PDFs, splitting stories, segmenting passages, facets, embeddings) is a Python package in `extract/`, because pdfplumber and biberplus are Python and work. Everything that calls a model, the server and the UI are TypeScript under `app/`. The two meet only in the SQLite store. TypeScript owns the schema and its migrations, and Python mirrors the version number and refuses a store that is behind.

## Considered Options

- **All TypeScript**: no equivalent of the two Python libraries.
- **Evolving the old Python tree**: its spine, drawing in Python with doctrine in a playbook, is what this layout replaced.
