# Imagen pequeña y moderna de Node
FROM node:20-alpine

# Carpeta de trabajo
WORKDIR /app

# Copiamos manifiestos primero para aprovechar la cache
COPY package*.json ./

# Instala deps de producción (sin dev)
RUN npm ci --omit=dev

# Copia el resto del código
COPY . .

# Entorno prod dentro del contenedor
ENV NODE_ENV=production

# Azure (y muchos PaaS) inyectan el puerto por la var PORT
EXPOSE 3000

# Arranque del servidor
CMD ["node", "server.js"]
