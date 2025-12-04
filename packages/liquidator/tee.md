# how to deploy to phala tee

1. auth with phala
2. make sure all containers are registered
```
docker build -f packages/liquidator/services/price-service/Dockerfile -t jpag/price-service:latest .
```