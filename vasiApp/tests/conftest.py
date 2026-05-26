import importlib
import os
import sys
from pathlib import Path

import pytest


@pytest.fixture(scope="session")
def app_module():
    """Import the Flask app module once.

    Notes:
    - `app.py` loads the stimulus using a relative path like `dataset/...` at
      import time.
    - Pytest can be invoked from different working directories.

    To make imports stable, we:
    1) add the `vasiApp/` folder (parent of this `tests/` folder) to `sys.path`
    2) set the process CWD to the repository root (parent of `vasiApp/`)
    """

    vasiapp_dir = Path(__file__).resolve().parents[1]      # .../pfa/vasiApp
    repo_root = vasiapp_dir.parent                         # .../pfa

    sys.path.insert(0, str(vasiapp_dir))

    # Make relative paths in app.py (e.g. dataset/...) resolve correctly
    os.chdir(str(repo_root))

    return importlib.import_module("app")


@pytest.fixture()
def client(app_module):
    app = app_module.app
    app.config.update({"TESTING": True})
    with app.test_client() as c:
        yield c
