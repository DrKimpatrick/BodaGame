import * as THREE from 'three'

export const jobPassengerSkinMat = new THREE.MeshStandardMaterial({
  color: '#c4a574',
  roughness: 0.66,
  metalness: 0.02,
})

export const jobPassengerCoatRedMat = new THREE.MeshStandardMaterial({
  color: '#b91c1c',
  roughness: 0.72,
  metalness: 0.05,
  emissive: '#450a0a',
  emissiveIntensity: 0.06,
})

export const jobPassengerCoatBlueMat = new THREE.MeshStandardMaterial({
  color: '#1d4ed8',
  roughness: 0.7,
  metalness: 0.06,
  emissive: '#172554',
  emissiveIntensity: 0.05,
})

export const jobPassengerPantsMat = new THREE.MeshStandardMaterial({
  color: '#1e293b',
  roughness: 0.84,
  metalness: 0.03,
})

export const jobPassengerBagMat = new THREE.MeshStandardMaterial({
  color: '#78350f',
  roughness: 0.9,
  metalness: 0.02,
})
