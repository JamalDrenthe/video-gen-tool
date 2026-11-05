FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir pillow flask gunicorn
COPY render.py app.py /app/
WORKDIR /app
EXPOSE 8080
CMD ["gunicorn", "-w", "1", "--timeout", "600", "-b", "0.0.0.0:8080", "app:app"]
