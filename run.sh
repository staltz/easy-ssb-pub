#!/bin/bash
npm run compile && node dist/index --host ${NOW_URL:-$PUB_URL};