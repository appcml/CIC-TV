name: Scraping Partidos FutbolLibre

on:
  # Ejecutar cada hora en punto
  schedule:
    - cron: '0 * * * *'
  # Permitir ejecución manual desde GitHub
  workflow_dispatch:

jobs:
  scrape:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      # 1. Clonar el repositorio
      - name: Checkout repo
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      # 2. Instalar Python
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      # 3. Instalar dependencias
      - name: Instalar dependencias
        run: |
          pip install playwright beautifulsoup4 requests
          playwright install chromium
          playwright install-deps chromium

      # 4. Correr el scraper
      - name: Scraping de partidos
        run: python scraper.py

      # 5. Verificar que se generó el JSON
      - name: Verificar partidos.json
        run: |
          if [ -f "partidos.json" ]; then
            echo "✅ partidos.json generado"
            cat partidos.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Total: {d[\"total\"]} partidos')"
          else
            echo "❌ partidos.json no encontrado"
            exit 1
          fi

      # 6. Commit y push del JSON actualizado
      - name: Commit partidos.json
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add partidos.json
          # Solo hacer commit si hay cambios
          git diff --staged --quiet || git commit -m "🤖 Actualizar partidos.json [$(date -u '+%Y-%m-%d %H:%M')] UTC"
          git push
