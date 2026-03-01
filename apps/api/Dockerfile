# Imagen pequeña y moderna de Node
FROM node:20-alpine

# Carpeta de trabajo del servicio API
WORKDIR /app

# Copiamos manifiestos primero para aprovechar la cache
COPY package*.json ./

# Instala dependencias (incluye dev para compilar TypeScript)
RUN npm install

# Copia el código del backend
COPY . .

# Compila TypeScript
RUN npm run build

# Entorno prod dentro del contenedor
ENV NODE_ENV=production

EXPOSE 3000

# Arranque del servidor
CMD ["node", "dist/server.js"]
