import bufferStreamReader from "buffer-stream-reader";
import Hooks from "@reactioncommerce/hooks";
import { FileRecord } from "@reactioncommerce/file-collections";
import { Products } from "/lib/collections";
import { Media } from "/imports/plugins/core/files/server";

function getTopVariant(productId) {
  const topVariant = Products.findOne({
    ancestors: { $in: [productId] },
    "ancestors.1": { $exists: false }
  });
  return topVariant;
}

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

function addProductImage(product) {
  const filepath = `data/product-images/${product._id}.jpg`;
  const binary = Assets.getBinary(filepath);
  const buffer = new Buffer(binary);
  const fileName = `${product._id}.jpg`;
  const fileRecord = new FileRecord({
    original: {
      name: fileName,
      size: buffer.length,
      type: "image/jpeg",
      updatedAt: new Date()
    }
  });
  fileRecord.attachData(buffer);

  const topVariant = getTopVariant(product._id);
  const { shopId } = product;
  fileRecord.metadata = {
    productId: product._id,
    variantId: topVariant._id,
    toGrid: 1,
    shopId,
    priority: 0,
    workflow: "published"
  };

  Promise.await(Media.insert(fileRecord));
  Promise.await(storeFromAttachedBuffer(fileRecord));

}

Hooks.Events.add("afterCoreInit", () => {
  Products.find({ type: "simple", isDeleted: false }).forEach(product => {
    if (!Promise.await(Media.findOne({ "metadata.productId": product._id }))) {
      addProductImage(product);
    }
  });
});
