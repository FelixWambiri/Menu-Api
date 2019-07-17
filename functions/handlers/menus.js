const { db, admin } = require("../util/admin");
const config = require("../util/config");

const Busboy = require("busboy");
const path = require("path");
const os = require("os");
const fs = require("fs");

const menuImageUrl = imageFileName =>
  `https://firebasestorage.googleapis.com/v0/b/${
    config.storageBucket
  }/o/${imageFileName}?alt=media`;

const uploadImage = (req, res) => {
  const userId = req.user.uid;
  const busboy = new Busboy({ headers: req.headers });

  let imageFileName;
  let imageToBeUploaded = {};

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    if (mimetype !== "image/jpeg" && mimetype !== "image/png") {
      return res.status(400).json({ error: "Wrong file type submitted" });
    }

    const imageExtension = filename.split(".")[filename.split(".").length - 1];
    imageFileName = `${Math.round(
      Math.random() * 1000000000000
    ).toString()}.${imageExtension}`;
    const filepath = path.join(os.tmpdir(), imageFileName);
    imageToBeUploaded = { filepath, mimetype };
    file.pipe(fs.createWriteStream(filepath));
  });

  busboy.on("finish", () => {
    admin
      .storage()
      .bucket()
      .upload(imageToBeUploaded.filepath, {
        resumable: false,
        metadata: {
          metadata: {
            contentType: imageToBeUploaded.mimetype
          }
        }
      })
      .then(() => {
        return res.json({
          message: "Image uploaded successfully",
          menuImageUrl: menuImageUrl(imageFileName),
          userId:userId
        });
      })
      .catch(err => {
        console.log(err);
        return res.status(400).json({ error: "Error uploading file" });
      });
  });
  busboy.end(req.rawBody);
};

const postNewMenu = async (req, res) => {
  const newMenu = {
    type: req.body.type,
    name: req.body.name,
    price: req.body.price,
    menuImage: req.body.menuImage,
    createdAt: new Date().toISOString(),
    userName: req.user.userName,
    likeCount: 0,
    userImage: req.user.imageUrl
  };

  db.collection("menus")
    .add(newMenu)
    .then(doc => {
      const resMenu = newMenu;
      resMenu.menuId = doc.id;
      return res.status(201).json(resMenu);
    })
    .catch(err => {
      res.status(500).json({ error: "Something went wrong" });
      console.error(err);
    });
};
let updatedMenu;

const updateMenu = async (req, res) => {
  db.doc(`/menus/${req.params.menuId}`)
    .get()
    .then(doc => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Menu not found" });
      }

      if (doc.data().userName !== req.user.userName) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      /* eslint-disable no-extra-boolean-cast */
      updatedMenu = {
        type: Boolean(req.body.type) ? req.body.type : doc.data().type,
        name: Boolean(req.body.name) ? req.body.name : doc.data().name,
        price: Boolean(req.body.price) ? req.body.price : doc.data().price,
        menuImage: Boolean(req.body.menuImage)
          ? req.body.menuImage
          : doc.data().menuImage,
        createdAt: doc.data().createdAt,
        userName: doc.data().userName,
        likeCount: doc.data().likeCount,
        userImage: doc.data().userImage
      };

      return db.doc(`/menus/${req.params.menuId}`).update(updatedMenu);
    })
    .then(() => {
      return res.json(updatedMenu);
    })
    .catch(err => {
      console.log(err);
      return res.status(500).json({ error: err.code });
    });
};

const getAllmenus = (req, res) => {
  db.collection("menus")
    .orderBy("createdAt", "desc")
    .get()
    .then(data => {
      let menus = [];
      data.forEach(doc => {
        menus.push({
          menuId: doc.id,
          type: doc.data().type,
          name: doc.data().name,
          price: doc.data().price,
          menuImage: doc.data().menuImage,
          createdAt: doc.data().createdAt,
          userName: doc.data().userName,
          likeCount: doc.data().likeCount,
          userImage: doc.data().userImage
        });
      });
      return res.json(menus);
    })
    .catch(err => {
      console.log(err);
      return res.status(500).json({ error: err.code });
    });
};

const getOneMenu = (req, res) => {
  let menuData = {};
  db.doc(`/menus/${req.params.menuId}`)
    .get()
    .then(doc => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Menu not found" });
      }
      menuData = doc.data();
      menuData.menuId = doc.id;
      return res.json(menuData);
    })
    .catch(err => {
      console.log(err);
    });
};

const deleteMenu = (req, res) => {
  const document = db.doc(`/menus/${req.params.menuId}`);

  document
    .get()
    .then(doc => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Menu not found" });
      }
      if (doc.data().userName !== req.user.userName) {
        return res.status(403).json({ error: "Unauthorized" });
      } else {
        return document.delete();
      }
    })
    .then(() => {
      return res.status(200).json({ message: "Menu deleted successfully" });
    })
    .catch(err => {
      console.log(err);
      return res.status(500).json({ error: err.code });
    });
};

const likeMenu = (req, res) => {
  const likeDocument = db
    .collection("likes")
    .where("userName", "==", req.user.userName)
    .where("menuId", "==", req.params.menuId)
    .limit(1);

  const menuDocument = db.doc(`/menus/${req.params.menuId}`);

  let menuData;

  menuDocument
    .get()
    .then(doc => {
      if (doc.exists) {
        menuData = doc.data();
        menuData.menuId = doc.id;
        return likeDocument.get();
      } else {
        return res.status(404).json({ error: "Menu does not exist" });
      }
    })
    .then(data => {
      if (data.empty) {
        /* eslint-disable promise/no-nesting */
        return db
          .collection("likes")
          .add({
            menuId: req.params.menuId,
            userName: req.user.userName
          })
          .then(() => {
            menuData.likeCount++;
            return menuDocument.update({ likeCount: menuData.likeCount });
          })
          .then(() => {
            return res.json(menuData);
          });
      } else {
        return res.status(400).json({ error: "Menu already liked" });
      }
    })
    .catch(err => {
      console.log(err);
    });
};

const unlikeMenu = (req, res) => {
  const likeDocument = db
    .collection("likes")
    .where("userName", "==", req.user.userName)
    .where("menuId", "==", req.params.menuId)
    .limit(1);

  const menuDocument = db.doc(`/menus/${req.params.menuId}`);

  let menuData;

  menuDocument
    .get()
    .then(doc => {
      if (doc.exists) {
        menuData = doc.data();
        menuData.Id = doc.id;
        return likeDocument.get();
      } else {
        return res.status(404).json({ error: "Menu does not exist" });
      }
    })
    .then(data => {
      if (data.empty) {
        return res.status(400).json({ error: "Menu not liked" });
      } else {
        /* eslint-disable promise/no-nesting */
        return db
          .doc(`/likes/${data.docs[0].id}`)
          .delete()
          .then(() => {
            menuData.likeCount--;
            return menuDocument.update({ likeCount: menuData.likeCount });
          })
          .then(() => {
            return res.json(menuData);
          });
        /* eslint-disable promise/no-nesting */
      }
    })
    .catch(err => {
      console.log(err);
    });
};

module.exports = {
  uploadImage,
  postNewMenu,
  updateMenu,
  getAllmenus,
  getOneMenu,
  deleteMenu,
  likeMenu,
  unlikeMenu
};
