import React from 'react';
import { VaultProvider } from './context/VaultContext';
import { MainLayout } from './components/layout/MainLayout';

export default function App() {
  return (
    <VaultProvider>
      <MainLayout />
    </VaultProvider>
  );
}
