FROM python:3.12-alpine

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY index.html /app/index.html
COPY dashboard.html /app/dashboard.html
COPY assets /app/assets
COPY server.py /app/server.py

ENV PORT=8080
EXPOSE 8080

CMD ["python", "server.py"]