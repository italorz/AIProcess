$body = @{
    numeroProcesso = '0011632-42.2024.5.15.0033'
} | ConvertTo-Json

Invoke-RestMethod -Uri 'http://localhost:3333/scraping/start' -Method Post -Body $body -ContentType 'application/json'

