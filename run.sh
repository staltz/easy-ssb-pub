#!/bin/bash
echo $NOW_URL;
# while true; do
node dist/index --host ${NOW_URL:-$APP_URL}
# done