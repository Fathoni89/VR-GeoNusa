"""
Convert MLTraining/output/model.h5 -> ml-model/ (TensorFlow.js Layers format).

Goes through the Python API instead of the `tensorflowjs_converter` CLI: TF
2.19 saves .h5 via Keras 3, whose HDF5 writer the CLI's version-sniffing
doesn't recognize ("failed to lookup keras version from the file"). Loading
the model back with tf.keras and calling save_keras_model() directly on the
live model object sidesteps that file-format detection entirely.
"""
import os
import tensorflow as tf
import tensorflowjs as tfjs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output', 'model.h5')
OUT_DIR = os.path.join(ROOT, 'ml-model')

model = tf.keras.models.load_model(MODEL_PATH)
tfjs.converters.save_keras_model(model, OUT_DIR)
print(f"Konversi selesai -> {OUT_DIR}")
