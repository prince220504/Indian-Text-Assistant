import os 

# HF loads the embedding model at import time (retriever.py line 10), so these
# must be set BEFORE transformers is imported - .env/load_dotenv() runs too late.
# This __init__ is the one file every entrypoint runs first.
# OFFLINE=1 = never phone home; model is already cached on disk.
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("HF_HUB_OFFLINE", "1")
