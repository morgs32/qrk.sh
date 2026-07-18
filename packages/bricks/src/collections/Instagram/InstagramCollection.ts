import { primitives } from "@zerospin/core/models/primitives";

import { makeCollection } from "../../makeCollection";
import { makeBrick } from "../../makeBrick";
import { makeVariant } from "../../makeVariant";
import { InstagramDefault4x4 } from "./InstagramDefault4x4";

export const instagramCollection = makeCollection({
  collectionName: "instagram",
  collectionLabel: "Instagram",
  collectionDescription: "A public Instagram profile and its latest posts.",
  variants: {
    default: makeVariant({
      variant: "default",
      variantDescription: "An Instagram profile card with four recent posts.",
      payloadShape: {
        url: primitives.text({ defaultValue: "https://www.instagram.com/theonion/" }),
      },
      dataShape: {
        username: primitives.text(),
        profileImageUrl: primitives.text(),
        followersText: primitives.text(),
        postImageUrl1: primitives.text(),
        postImageUrl2: primitives.text(),
        postImageUrl3: primitives.text(),
        postImageUrl4: primitives.text(),
      },
      defaultData: {
        username: "theonion",
        profileImageUrl:
          "https://scontent.cdninstagram.com/v/t51.2885-19/22499827_134270983962832_6645474159751069696_n.jpg?stp=dst-jpg_s100x100_tt6&_nc_cat=108&ccb=7-5&_nc_sid=bf7eb4&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLnd3dy40MDAuQzMifQ%3D%3D&_nc_ohc=Is-XhErTL_AQ7kNvwEMZmbh&_nc_oc=Ado1SYlVijMyHngdtG-nnjoemuhiWGE6QBCnELzM-9cLH_ywdEuSTI9LOJl_LGjlHVs&_nc_zt=24&_nc_ht=scontent.cdninstagram.com&_nc_ss=7f689&oh=00_AQB12wZhKM-3PXZvZPGL4_aw5CwDaUK_WonVxtTkYXnqmw&oe=6A61D342",
        followersText: "5M",
        postImageUrl1:
          "https://instagram.faus1-1.fna.fbcdn.net/v/t51.82787-15/730381663_18608627611010586_115665100309857705_n.jpg?stp=dst-jpg_e15_tt6&_nc_cat=100&ig_cache_key=MzkzMzMxMDEwNjY3OTA0NTEzNDE4NjA4NjI3NjA4MDEwNTg2.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNMSVBTLnhwaWRzLjEwODAuc2RyLnZpZGVvX2RlZmF1bHRfY292ZXJfZnJhbWUuQzMifQ%3D%3D&_nc_ohc=DSchvSeAuXMQ7kNvwEPRCmJ&_nc_oc=Adoc-63wCSdYBgDrF8DSQPNNricSN5Vw1I9htFBitN9g0FzfA_X72Hrwr26euKq5tjI&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=instagram.faus1-1.fna&_nc_gid=FIs8QckpOVOcFW0GoQuidg&_nc_ss=7a22e&oh=00_AQBbdVdbP49EmtIXNVLo55kEZyJ1H_VU66apOe0YdsMyGQ&oe=6A61CCB9",
        postImageUrl2:
          "https://instagram.faus1-1.fna.fbcdn.net/v/t51.82787-15/574468858_18545011423010586_5218756149777267906_n.jpg?stp=dst-jpg_e15_tt6&_nc_cat=102&ig_cache_key=Mzc2MDA0MjYxNDE2Mzg0Njg0NTE4NTQ1MDExNDE3MDEwNTg2.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNMSVBTLnhwaWRzLjEwODAuc2RyLnZpZGVvX2RlZmF1bHRfY292ZXJfZnJhbWUuQzMifQ%3D%3D&_nc_ohc=XrswsFLbkWUQ7kNvwFfhdnk&_nc_oc=Adq6gIdTLZkVhKKzXT6ujVvO3YA-qfsL9hclAUbl4jimIoiXU0eVHMuT4EDler0eFe8&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=instagram.faus1-1.fna&_nc_gid=FIs8QckpOVOcFW0GoQuidg&_nc_ss=7a22e&oh=00_AQAp0dOoVTIIZTl6AiOedYkOxIiz2F9skQZiAcu6HTxCqg&oe=6A619ED9",
        postImageUrl3:
          "https://instagram.faus1-1.fna.fbcdn.net/v/t51.82787-15/748278298_18613309585010586_5691367025543547810_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=1&ig_cache_key=Mzk0NDE2NTc1NTg3MzkxNTEwMg%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkZFRUQueHBpZHMuMTA4MC5zZHIucmVndWxhcl9waG90by5DMyJ9&_nc_ohc=5sFfi_M1HsoQ7kNvwFggF-D&_nc_oc=AdqSfvZYhvYWUdr6qoEcMHTmZMWlo1stekj6sYe3UQtFWamzs6sL0D0dv-Rr9lUFIjc&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=instagram.faus1-1.fna&_nc_gid=FIs8QckpOVOcFW0GoQuidg&_nc_ss=7a22e&oh=00_AQD_laIQrHk9Sf0Rs2KKH7-jjJf0QPH54Q9DL9RdIK8OCg&oe=6A61B37F",
        postImageUrl4:
          "https://instagram.faus1-1.fna.fbcdn.net/v/t51.82787-15/749714051_18613274569010586_2155729153985215318_n.jpg?stp=dst-jpg_e15_tt6&_nc_cat=103&ig_cache_key=Mzk0NDEwNTM1NjYzNzM1MTM4MzE4NjEzMjc0NTYzMDEwNTg2.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IkNMSVBTLnhwaWRzLjEwODAuc2RyLnZpZGVvX2RlZmF1bHRfY292ZXJfZnJhbWUuQzMifQ%3D%3D&_nc_ohc=M2MacKdfvFoQ7kNvwGG1cxF&_nc_oc=Adp8XB00lCApv90RttYRYu2QZ5ccCOO2qDVezJjN8vYmbuYYKyThSChjCWQ2TntpddI&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=instagram.faus1-1.fna&_nc_gid=FIs8QckpOVOcFW0GoQuidg&_nc_ss=7a22e&oh=00_AQCjahbwZLuvKuFDCIEYZXwSv1R-u8zPqVde0ZLQvuxG_g&oe=6A61AADC",
      },
      getData: ({ api, payload }) => api.instagramRepo().scrape(payload.url),
      sizes: {
        "4x4": makeBrick({
          variant: "default",
          size: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          component: InstagramDefault4x4,
        }),
      },
    }),
  },
});
