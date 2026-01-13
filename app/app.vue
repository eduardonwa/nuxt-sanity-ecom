<script setup lang="ts">
import { firstVariantQuery, type VariantResult } from "../queries";

const { data: variant, pending } = await useSanityQuery<VariantResult>(firstVariantQuery);

async function pay() {
  if (!variant.value?._id) return;

  const cartItems = [
    { variantId: variant.value._id, quantity: 1 },
  ];

  const res = await $fetch<{ url: string }>("/api/checkout-session", {
    method: "POST",
    body: { items: cartItems },
  });

  window.location.href = res.url;
}
</script>

<template>
  <div>
    <div v-if="pending">Loading...</div>

    <div v-else>
      <h1>{{ variant?.title }} — {{ variant?.format }}</h1>
      <p>Precio: {{ variant?.price }} {{ variant?.currency?.toUpperCase() }}</p>
      <p>Stock: {{ variant?.stock ?? "?" }}</p>

      <button :disabled="!variant?._id || (variant?.stock ?? 0) <= 0" @click="pay">
        Pagar ahora
      </button>
    </div>
  </div>
</template>
