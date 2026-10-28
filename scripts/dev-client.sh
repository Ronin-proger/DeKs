#!/usr/bin/env sh
cd "$(dirname "$0")/../client" || exit 1
exec npm run dev
