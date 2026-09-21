import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BOOKS = ROOT / "corpus" / "books"


def run(*args, db):
    env = dict(os.environ, CLOUDCHAMBER_DB=str(db))
    return subprocess.run([sys.executable, "-m", "extract", *args], cwd=ROOT, env=env,
                          capture_output=True, text=True, check=True)


@pytest.fixture(scope="session")
def db(tmp_path_factory):
    """A store built from the dev subset: read, segment, facets. Skips when the
    corpus is not on disk (the PDFs are not redistributable)."""
    if not (BOOKS / "Ellen Datlow - The Best Horror of the Year Volume 01.pdf").exists():
        pytest.skip("dev sources not present")
    path = tmp_path_factory.mktemp("store") / "cloudchamber.db"
    run("read", db=path)
    run("segment", db=path)
    run("facets", db=path)
    import sqlite3
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    yield con
    con.close()
