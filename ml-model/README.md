# ml-model — TensorFlow.js model (output)

Ditaruh di sini setelah training selesai (lihat `MLTraining/`):

```
ml-model/
├── model.json
└── group1-shard1of1.bin
```

Dihasilkan dari `model.h5` (Keras) via:

```bash
tensorflowjs_converter --input_format=keras model.h5 ml-model/
```

Dimuat di frontend dengan `tf.loadLayersModel('/ml-model/model.json')`
(TensorFlow.js, ditambahkan sebagai `<script>` di `index.html` / `scenes/*.html`
saat implementasi inference siap). Urutan kelas output harus mengikuti urutan
`classes` di [`data/geometry-labels.json`](../data/geometry-labels.json).

Hingga model nyata tersedia, `api/ml-placeholder.json` tetap dipakai sebagai
mock response oleh frontend.
