# About

FastDash is a highly configurable self-hosted web dashboard meant for consolidating links to various homelab devices and services into one place. The site runs on nginx and can by default be accessed on port 8090 of your server.

![Alt text](https://raw.githubusercontent.com/shdeva/FastDash/refs/heads/main/Images/screenshot1.png)

FastDash includes several visual themes, drag and drop rearranging, icon sorting/view modes, and many other options to customize look and feel. It's also responsive to many different screen sizes and ratios. You can download the configuration file for backup purposes.

![Alt text](https://raw.githubusercontent.com/shdeva/FastDash/refs/heads/main/Images/screenshot3.png)

## Setup

docker-compose-Dockge.yml is ready to use in any Docker manager. Just paste and go.

docker-compose-TrueNAS.yml needs a few more steps because of the way TrueNAS handles storage for custom apps. Before deploying, replace the placeholder data path on line 14 with a real persistent directory on your host:

```yaml
volumes:
  - /REPLACE/WITH/YOUR/PERSISTENT/FASTDASH/DATA:/data:rw
```

For example, on TrueNAS SCALE you might create a dataset such as:

```text
/mnt/tank/AppData/FastDash
```

The updated compose file would then look like this:

```yaml
volumes:
  - /mnt/tank/AppData/FastDash:/data:rw
```

*Providing a dataet path for TrueNAS is critical, otherwise your user config will be wiped any time the container is restarted.*

To use the yaml on TrueNAS go to Apps > Discover Apps > More Options (the three dot button next to Custom App) > Install via YAML

On either version, the container is configured to pull the latest version from GitHub any time it is restarted.

## Notes

**Icon behavior:** [Selfhost](https://selfh.st/icons/) is a great source for providing custom button icons. If no image URL is provided in the button config, FastDash will attempt to pull a favicon from the service URL.

![Alt text](https://raw.githubusercontent.com/shdeva/FastDash/refs/heads/main/Images/screenshot2.png)

This is mostly a personal project that I decided to make public. It's functional as is and while I have ideas for more features/refinements/themes I'm not planning to commit to any sort of maintenance or release cycle. Feel free to report bugs and suggest stuff tho.

A locally run LLM was used in the creation of FastDash for *coding only*. No generative AI was used to create imagery.

All fonts, icons, and images used in this project are freely available or created by myself.
