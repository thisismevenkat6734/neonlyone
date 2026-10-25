
const CLOUDINARY_CLOUD_NAME = "lqfozcs3";
const CLOUDINARY_UPLOAD_PRESET = "create_your_own_identity";

const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;

async function uploadMedia(file, onProgress) {
  if (!(file instanceof File)) {
    throw new Error("Please select a valid file.");
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "audio/mpeg",
    "audio/mp4",
    "audio/ogg",
    "audio/wav",
    "audio/webm"
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("This file type is not supported.");
  }

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const isAudio = file.type.startsWith("audio/");

  const maxSize = isImage
    ? 10 * 1024 * 1024
    : isVideo
      ? 50 * 1024 * 1024
      : 20 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error(
      isImage
        ? "Images must be 10 MB or smaller."
        : isVideo
          ? "Videos must be 50 MB or smaller."
          : "Audio files must be 20 MB or smaller."
    );
  }

  if (isVideo) {
    const videoUrl = URL.createObjectURL(file);

    try {
      const duration = await new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => resolve(video.duration);
        video.onerror = () => reject(
          new Error("Could not read video duration.")
        );
        video.src = videoUrl;
      });

      if (!Number.isFinite(duration) || duration > 30) {
        throw new Error("Videos must be 30 seconds or shorter.");
      }
    } finally {
      URL.revokeObjectURL(videoUrl);
    }
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  if (typeof onProgress === "function") {
    onProgress({ status: "uploading", percent: 0 });
  }

  const response = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: "POST",
    body: formData
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result?.error?.message || "Media upload failed. Please try again."
    );
  }

  if (typeof onProgress === "function") {
    onProgress({ status: "complete", percent: 100 });
  }

  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    format: result.format,
    bytes: result.bytes,
    duration: result.duration ?? null
  };
}

export {
  CLOUDINARY_CLOUD_NAME,
  uploadMedia
};
