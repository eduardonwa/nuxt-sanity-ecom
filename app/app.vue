<script setup lang="ts">
import { variantsQuery, type VariantResult } from "../queries";

const { data: variants, pending } = await useSanityQuery<VariantResult[]>(variantsQuery);

async function pay(variantId: string) {
  const res = await $fetch<{ url: string }>("/api/checkout-session", {
    method: "POST",
    body: {
      items: [{ variantId, quantity: 1 }],
    },
  });

  window.location.href = res.url;
}
</script>

<template>
  <div>
    <div v-if="pending">Loading...</div>

    <div v-else>
      <div v-for="v in (variants || [])" :key="v._id">
        <h1>{{ v.title }} — {{ v.format }}</h1>
        <p>Precio: {{ v.price }} {{ v.currency.toUpperCase() }}</p>
        <p>Stock: {{ v.stock }}</p>

        <button :disabled="v.stock <= 0" @click="pay(v._id)">
          Pagar ahora
        </button>
      </div>
    </div>
  </div>
</template>
