Put downloaded Hugging Face model repo files in the `models` folder so the dev server can serve them locally.

For Gemma (example):

1. Create directory: `models/google/gemma-2b/resolve/main/`
2. Download and place files into that directory as they would appear on HF, e.g.:
   - config.json
   - tokenizer.json
   - tokenizer_config.json
   - pytorch_model.bin (or converted files)
   - any other weights/tokenizer files

The app expects to fetch assets at paths like:

  http://127.0.0.1:8812/models/google/gemma-2b/resolve/main/config.json

After placing files, reload the app and select the local Gemma entry from the slash menu. If files are present, the loader should be able to read config and proceed; if not present you'll get 404s for the missing files.
