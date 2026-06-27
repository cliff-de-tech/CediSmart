#!/bin/sh
# CediSmart API startup script
# Runs database migrations then starts the server.

set -e

echo "Running database migrations..."
alembic upgrade head

echo "Seeding system categories..."
python -m scripts.seed_categories

echo "Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
