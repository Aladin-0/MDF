FROM python:3.10-slim
WORKDIR /app
# libpango / harfbuzz / glib / fontconfig + a font: what WeasyPrint needs to render PDFs. Without them every
# WeasyPrint PDF failed in production with "cannot load library 'libgobject-2.0-0'".
RUN apt-get update -o Acquire::ForceIPv4=true && DEBIAN_FRONTEND=noninteractive apt-get install -y -o Acquire::ForceIPv4=true \
    libpq-dev gcc \
    libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libharfbuzz-subset0 libglib2.0-0 libfontconfig1 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
# RapidOCR pulls in the GUI OpenCV wheel. Keep only its headless runtime in this server image.
RUN pip install --default-timeout=1000 --no-cache-dir -r requirements.txt \
    && pip uninstall -y opencv-python \
    && pip install --default-timeout=1000 --no-cache-dir --no-deps --force-reinstall opencv-python-headless==5.0.0.93
COPY . .
EXPOSE 8000
CMD ["gunicorn", "mediflow.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-"]
