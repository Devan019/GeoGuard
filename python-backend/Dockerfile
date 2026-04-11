FROM python:3.11-slim 

# 1. Install missing system libraries (and clean up cache to save space)
RUN apt-get update && apt-get install -y libexpat1 && rm -rf /var/lib/apt/lists/*

# 2. Install uv directly from Astral's official Docker image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# 3. Copy your uv configuration files instead of requirements.txt
# (The asterisk ensures it won't crash if uv.lock hasn't been generated yet)
COPY pyproject.toml uv.lock* ./

# 4. Install dependencies using uv sync
# This creates a virtual environment at /app/.venv
RUN uv sync --frozen --no-install-project --no-dev

# 5. Copy the rest of your application code
COPY . .

# 6. Prepend the uv virtual environment to the system PATH
# This ensures Docker uses the Python and packages installed by uv
ENV PATH="/app/.venv/bin:$PATH"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]