# The grids (web/public/grids) as an image, for the cluster: each pod that reads them copies them into its own volume
# with an init container (infra/k8s). Locally, compose mounts the folder instead. Build context: the repo root.
FROM busybox:1.37.0
COPY web/public/grids /grids
