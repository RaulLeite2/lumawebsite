FROM python:3.12-alpine

WORKDIR /app

COPY index.html /app/index.html
COPY assets /app/assets
COPY server.py /app/server.py

ENV PORT=8080
EXPOSE 8080

CMD ["python", "server.py"]