<script setup lang="ts">
  import { pageQuery, type PageResult } from '../queries'
  const { data, pending } = await useSanityQuery<PageResult>(pageQuery)
 
  const cartItems = [
    { name: "Disco X", unit_amount: 49900, quantity: 1 },
  ];

  async function pay() {
    const res = await $fetch<{ url: string }>("/api/checkout-session", {
      method: "POST",
      body: { items: cartItems },
    });

    window.location.href = res.url;
  }
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <div v-if="pending">Loading...</div>
    <h1 v-else>{{ data?.title }}</h1>

    <button @click="pay">
      Pagar ahora
    </button>
  </div>
</template>
