FROM python:3.10-slim
WORKDIR /app
RUN apt-get update -o Acquire::ForceIPv4=true && DEBIAN_FRONTEND=noninteractive apt-get install -y -o Acquire::ForceIPv4=true \
    libpq-dev gcc && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --default-timeout=1000 --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["gunicorn", "mediflow.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-"]
