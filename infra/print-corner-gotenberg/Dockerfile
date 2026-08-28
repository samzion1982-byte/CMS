# Custom Gotenberg image with church Tamil fonts (e.g. ATM 35).
# Build on the VM after copying your .ttf/.otf files into ./fonts/
#
#   docker build -t print-corner-gotenberg:local .
#   # In .env: GOTENBERG_IMAGE=print-corner-gotenberg:local
#   docker compose up -d

FROM gotenberg/gotenberg:8

USER root

RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig \
  && mkdir -p /usr/local/share/fonts/truetype/custom /usr/local/share/fonts/opentype/custom \
  && rm -rf /var/lib/apt/lists/*

COPY fonts/ /usr/local/share/fonts/truetype/custom/

RUN fc-cache -f -v

USER gotenberg
