# johann

A self-sufficient tool for keeping the images in a docker-compose file in sync
with remote registries.

When working with large docker-compose files one of the biggest challenges is
ensuring that you remove old images are new ones are pulled. johann arose from
constantly running out of hard drive space when working with high churn, low
shared image application staks.

johann help by tracking image size, layer reuse, and automatically removing old
images when a new one is pulled.

After the first time you run johann it is a good idea to run remove any untagged
images that may be left behind from prior `docker-compose pulls`.

```
docker rmi $(docker images -q --filter "dangling=true")
```


#### That Name

Named after the fisherman and composer Johann Fischer.
