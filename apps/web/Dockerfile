# Stage 1: build
FROM node:20-alpine AS build

WORKDIR /repo/apps/web

# Instala dependencias del frontend
COPY apps/web/package*.json ./
RUN npm ci

# Copia el frontend y el paquete compartido (usado por alias/imports)
COPY apps/web/ /repo/apps/web/
COPY packages/shared/ /repo/packages/shared/

RUN npm run build

# Stage 2: serve with nginx
FROM nginx:alpine

# React build
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

# Nginx config se monta desde docker-compose (docker/nginx/default.conf)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
