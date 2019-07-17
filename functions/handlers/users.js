const { admin, db } = require("../util/admin");
const config = require("../util/config");

const Busboy = require("busboy");
const path = require("path");
const os = require("os");
const fs = require("fs");

const firebase = require("firebase");
firebase.initializeApp(config);

const { validateSignupData, validateLogindata } = require("../util/validators");

exports.signup = (req, res) => {
  const newUser = {
    email: req.body.email,
    userName: req.body.userName,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword
  };

  const { valid, errors } = validateSignupData(newUser);

  if (!valid) return res.status(400).json(errors);

  const defaultMenuImage = "defaultMenuImage.png";

  let token, userId;
  db.doc(`/users/${newUser.userName}`)
    .get()
    .then(doc => {
      if (doc.exists) {
        return res
          .status(400)
          .json({ userName: "this username is already taken" });
      } else {
        return firebase
          .auth()
          .createUserWithEmailAndPassword(newUser.email, newUser.password);
      }
    })
    .then(data => {
      userId = data.user.uid;
      return data.user.getIdToken();
    })
    .then(idToken => {
      token = idToken;

      const userCredentials = {
        userName: newUser.userName,
        email: newUser.email,
        createdAt: new Date().toISOString(),
        imageUrl: `https://firebasestorage.googleapis.com/v0/b/${
          config.storageBucket
        }/o/${defaultMenuImage}?alt=media`,
        userId
      };

      return db.doc(`/users/${newUser.userName}`).set(userCredentials);
    })
    .then(() => {
      return res.status(201).json({ token });
    })
    .catch(err => {
      if (err.code === "auth/email-already-in-use") {
        return res.status(400).json({
          email: "Email is already in use"
        });
      } else {
        return res.status(500).json({
          general: "Something went wrong, please try again"
        });
      }
    });
};

exports.login = (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password
  };

  const { valid, errors } = validateLogindata(user);

  if (!valid) return res.status(400).json(errors);

  return firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then(data => {
      return data.user.getIdToken();
    })
    .then(token => {
      return res.status(200).json({ token });
    })
    .catch(err => {
      console.log(err);
      res
        .status(403)
        .json({ general: "Invalid credentials, please try again" });
    });
};

exports.getUserdetails = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.params.userName}`)
    .get()
    .then(doc => {
      if (doc.exists) {
        userData.user = doc.data();
        return db
          .collection("menus")
          .where("userName", "==", req.params.userName)
          .orderBy("createdAt", "desc")
          .get();
      } else {
        return res.status(404).json({ error: "User not found" });
      }
    })
    .then(data => {
      userData.menus = [];
      data.forEach(doc => {
        userData.menus.push({
          type: doc.data().type,
          name: doc.data().name,
          price: doc.data().price,
          menuImage: doc.data().menuImage,
          createdAt: doc.data().createdAt,
          userName: doc.data().userName,
          likeCount: doc.data().likeCount,
          userImage: doc.data().userImage,
          menuId: doc.id
        });
      });
      return res.json(userData);
    })
    .catch(err => {
      console.log(err);
    });
};

exports.getAuthenticatedUser = (req, res) => {
  let userData = {};

  /* eslint-disable promise/always-return */
  db.doc(`/users/${req.user.userName}`)
    .get()
    .then(doc => {
      if (doc.exists) {
        userData.credentials = doc.data();
        return db
          .collection("likes")
          .where("userName", "==", req.user.userName)
          .get();
      }
    })
    .then(data => {
      userData.likes = [];
      data.forEach(doc => {
        userData.likes.push(doc.data());
      });
      return res.json(userData);
    })
    .catch(err => {
      console.log(err);
      return res.status(500).json({ error: err.code });
    });
  /* eslint-disable promise/always-return */
};

exports.updateUserImage = (req, res) => {
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
        const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${
          config.storageBucket
        }/o/${imageFileName}?alt=media`;
        return db.doc(`/users/${req.user.userName}`).update({ imageUrl });
      })
      .then(() => {
        return res.json({ message: "Image uploaded successfully" });
      })
      .catch(err => {
        console.log(err);
        return res.status(400).json({ error: "Error uploading file" });
      });
  });
  busboy.end(req.rawBody);
};
