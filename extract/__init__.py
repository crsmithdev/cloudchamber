"""Cloud Chamber extraction: sources -> stories -> passages -> facets.

Python owns text and features and nothing else. It reads the manifest,
splits PDFs and SCP articles into stories, cuts verbatim passages, scores
them on Biber's dimensions and embeds themes on request. It makes no model
call and no network call. Everything it produces lands in the SQLite store
described by app/pipeline/store/schema.sql.
"""
