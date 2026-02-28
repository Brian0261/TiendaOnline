# Imagen pequeña y moderna de Node
FROM node:20-alpine

# Carpeta de trabajo (monorepo)
WORKDIR /repo/apps/api

# Copiamos manifiestos primero para aprovechar la cache
COPY apps/api/package*.json ./

# Instala dependencias
RUN npm install

# Copia el backend y el paquete compartido usado en runtime
COPY apps/api/ /repo/apps/api/
COPY packages/shared/ /repo/packages/shared/

# Compila TypeScript
RUN npm run build

# Entorno prod dentro del contenedor
ENV NODE_ENV=production

EXPOSE 3000

# Arranque del servidor
CMD ["node", "dist/server.js"]
