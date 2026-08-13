"""
VR-GeoNusa — training kelas geometri Candi Borobudur (MobileNetV2 transfer
learning) dari Dataset/geometry_wbn/{train,val,test}/<class>/.

Dataset dihasilkan dari foto panorama 360 derajat (generate_dataset.py), jadi
kelas apa pun yang belum diberi area di admin panel (Tur 360 Borobudur ->
Kelola Identifikasi) tidak akan punya data dan otomatis dilewati di sini.

Run: MLTraining/venv/bin/python MLTraining/train.py
Output: MLTraining/output/model.h5 + class_indices.json
"""
import json, os

# Keras 3 (default in TF 2.16+) serializes model graphs (inbound_nodes format,
# InputLayer keys) in a way the current tfjs.js loader — built for Keras 2 —
# can't parse ("Corrupted configuration, expected array for nodeData", "An
# InputLayer should be passed batchInputShape"). Forcing legacy Keras 2 via
# tf-keras avoids the whole format gap instead of patching it after the fact.
os.environ['TF_USE_LEGACY_KERAS'] = '1'

import tensorflow as tf
import tensorflowjs as tfjs
from tensorflow.keras import layers, models

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_DIR = os.path.join(ROOT, 'Dataset', 'geometry_wbn')
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
TFJS_OUT_DIR = os.path.join(ROOT, 'ml-model')
IMG_SIZE = (224, 224)
BATCH_SIZE = 16
EPOCHS_HEAD = 8
EPOCHS_FINETUNE = 5

os.makedirs(OUTPUT_DIR, exist_ok=True)


def count_images(split):
    d = os.path.join(DATASET_DIR, split)
    if not os.path.isdir(d):
        return 0
    return sum(len(os.listdir(os.path.join(d, c))) for c in os.listdir(d)
               if os.path.isdir(os.path.join(d, c)))


def main():
    print(f"train={count_images('train')} val={count_images('val')} test={count_images('test')} gambar")

    train_ds = tf.keras.utils.image_dataset_from_directory(
        os.path.join(DATASET_DIR, 'train'), image_size=IMG_SIZE, batch_size=BATCH_SIZE, label_mode='categorical')
    val_ds = tf.keras.utils.image_dataset_from_directory(
        os.path.join(DATASET_DIR, 'val'), image_size=IMG_SIZE, batch_size=BATCH_SIZE, label_mode='categorical')

    class_names = train_ds.class_names
    print('Kelas:', class_names)
    json.dump(class_names, open(os.path.join(OUTPUT_DIR, 'class_indices.json'), 'w'), indent=2)

    augment = tf.keras.Sequential([
        layers.RandomFlip('horizontal'),
        layers.RandomRotation(0.05),
        layers.RandomZoom(0.1),
        layers.RandomBrightness(0.15),
    ])

    AUTOTUNE = tf.data.AUTOTUNE
    train_ds = train_ds.map(lambda x, y: (augment(x, training=True), y)).prefetch(AUTOTUNE)
    val_ds = val_ds.prefetch(AUTOTUNE)

    base = tf.keras.applications.MobileNetV2(
        input_shape=IMG_SIZE + (3,), include_top=False, weights='imagenet')
    base.trainable = False

    inputs = tf.keras.Input(shape=IMG_SIZE + (3,))
    # layers.Rescaling (not the functional preprocess_input() call) — the
    # functional call traces raw ops (TrueDivide/Subtract) into the graph
    # that tfjs.js's layer registry can't deserialize on load. Rescaling is
    # a real Keras layer and does the same math: x/127.5 - 1.
    x = layers.Rescaling(scale=1. / 127.5, offset=-1)(inputs)
    x = base(x, training=False)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dropout(0.3)(x)
    outputs = layers.Dense(len(class_names), activation='softmax')(x)
    model = models.Model(inputs, outputs)

    model.compile(optimizer=tf.keras.optimizers.Adam(1e-3),
                  loss='categorical_crossentropy', metrics=['accuracy'])
    print('\n== Tahap 1: training head (base MobileNetV2 dibekukan) ==')
    model.fit(train_ds, validation_data=val_ds, epochs=EPOCHS_HEAD)

    print('\n== Tahap 2: fine-tuning (unfreeze beberapa layer akhir) ==')
    base.trainable = True
    for layer in base.layers[:-30]:
        layer.trainable = False
    model.compile(optimizer=tf.keras.optimizers.Adam(1e-5),
                  loss='categorical_crossentropy', metrics=['accuracy'])
    history = model.fit(train_ds, validation_data=val_ds, epochs=EPOCHS_FINETUNE)

    final_acc = history.history['val_accuracy'][-1]
    print(f'\nAkurasi validasi akhir: {final_acc:.1%}')

    model.save(os.path.join(OUTPUT_DIR, 'model.h5'))
    print(f"Model tersimpan: {os.path.join(OUTPUT_DIR, 'model.h5')}")

    # Konversi ke TF.js langsung dari objek model yang masih hidup di memori —
    # reload dari .h5 gagal karena layer preprocess_input (TrueDivide op)
    # tidak selalu round-trip bersih lewat format H5 legacy Keras 3.
    tfjs.converters.save_keras_model(model, TFJS_OUT_DIR)
    fix_input_layer_key(os.path.join(TFJS_OUT_DIR, 'model.json'))
    print(f"Model TF.js tersimpan: {TFJS_OUT_DIR}")


def fix_input_layer_key(model_json_path):
    # Keras 3 menulis InputLayer dengan key "batch_shape", tapi library
    # tfjs.js sisi browser (masih mengikuti konvensi Keras 2) hanya mengenali
    # "batch_input_shape" -> tanpa ini, tf.loadLayersModel() gagal dengan
    # "An InputLayer should be passed either a batchInputShape or inputShape".
    with open(model_json_path) as f:
        d = json.load(f)
    layers = d['modelTopology']['model_config']['config']['layers']
    for layer in layers:
        if layer.get('class_name') == 'InputLayer' and 'batch_shape' in layer['config']:
            layer['config']['batch_input_shape'] = layer['config'].pop('batch_shape')
    with open(model_json_path, 'w') as f:
        json.dump(d, f)


if __name__ == '__main__':
    main()
