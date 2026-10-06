# 🛒 Discord Loja Bot

Bot de loja para Discord.js v14.

## Variáveis do Railway

Configure:

- DISCORD_TOKEN = token do bot
- GUILD_ID = ID do seu servidor
- STAFF_ROLE_ID = ID do cargo da staff
- CATEGORY_ID = ID da categoria onde os pedidos serão criados
- PIX_KEY = sua chave Pix

## Comandos

- `/painelloja` — envia o painel da loja
- `/painelstaff` — abre o painel administrativo

## Observações

O banco usa `data.json`. No Railway, para persistência realmente garantida após recriações do serviço, é recomendado usar um banco externo ou volume persistente.
