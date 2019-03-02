// Created by Andre Machon 28/02/2019
import bufferStreamReader from "buffer-stream-reader";
import Hooks from "@reactioncommerce/hooks";
import { FileRecord } from "@reactioncommerce/file-collections";
import { Tags } from "/lib/collections";
import { Media } from "/imports/plugins/core/files/server";

// function getTopLevelTag(tagName) {
//   return Tags.findOne({ name: tagName, isTopLevel: true });
// }

async function storeFromAttachedBuffer(fileRecord) {
  const { stores } = fileRecord.collection.options;
  const bufferData = fileRecord.data;

  // We do these in series to avoid issues with multiple streams reading
  // from the temp store at the same time.
  try {
    for (const store of stores) {
      if (fileRecord.hasStored(store.name)) {
        return Promise.resolve();
      }

      // Make a new read stream in each loop because you can only read once
      const readStream = new bufferStreamReader(bufferData);
      const writeStream = await store.createWriteStream(fileRecord);
      await new Promise((resolve, reject) => {
        fileRecord.once("error", reject);
        fileRecord.once("stored", resolve);
        readStream.pipe(writeStream);
      });
    }
  } catch (error) {
    throw new Error("Error in storeFromAttachedBuffer:", error);
  }
}

function addCategoryTagImage(tag) {
  const filepath = `data/category-tag-images/${tag.name}.jpg`;
  const binary = Assets.getBinary(filepath);
  const buffer = new Buffer(binary);
  const fileName = `${tag.name}.jpg`;
  const fileRecord = new FileRecord({
    original: {
      name: fileName,
      size: buffer.length,
      type: "image/jpeg",
      updatedAt: new Date()
    }
  });
  fileRecord.attachData(buffer);

  // const categoryTag = getTopLevelTag(tag.name)
  const { shopId } = tag;
  fileRecord.metadata = {
    tagId: tag._id,
    tagName: tag.name,
    toGrid: 1,
    shopId,
    priority: 0,
    workflow: "published"
  };

  Promise.await(Media.insert(fileRecord));
  Promise.await(storeFromAttachedBuffer(fileRecord));

  // TODO set heroMediaUrl from inserted Media file
  Tags.update({_id: tag._id}, { $set: {heroMediaUrl: fileRecord.url({store: "large"})} })
}

Hooks.Events.add("afterCoreInit", () => {
  Tags.find({isTopLevel: true, isDeleted: false}).forEach(tag => {
    if(!Promise.await(Media.findOne({ "metadata.tagId": tag._id }))) {
      addCategoryTagImage(tag)
    }
  })

});
