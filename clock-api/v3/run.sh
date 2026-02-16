#!/bin/bash
set -x
export PATH=$PATH:$LAMBDA_TASK_ROOT/bin:/opt/python/lib/python3.12/site-packages/bin
export PYTHONPATH=$LAMBDA_TASK_ROOT:/var/lang/lib/python3.12/site-packages:/opt/python/:/opt/python/lib/python3.12/site-packages:$PYTHONPATH
export PORT=${PORT:-8000}
exec python -m uvicorn --port=$PORT --log-level critical app.main:app
