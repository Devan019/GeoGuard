# Your base image
FROM python:3.11-slim 

# 1. ADD THIS LINE: Install the missing system library
RUN apt-get update && apt-get install -y libexpat1

# 2. Then proceed with your normal setup
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]