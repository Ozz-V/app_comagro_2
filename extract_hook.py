import os

path = 'src/components/ProductDetailModal.tsx'
hookPath = 'src/hooks/useProductDetailLogic.ts'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

s1_marker = "  const [activeTab, setActiveTab] = useState('FICHA');"
s2_marker = "  const parseBoldText = (text: string) => {"

s1 = content.find(s1_marker)
s2 = content.find(s2_marker)

if s1 != -1 and s2 != -1:
    extracted = content[s1:s2]
    
    hook_code = '''import { useState, useRef, useEffect, useMemo } from 'react';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { ParsedProduct } from '../types';
import { fetchImageBase64, generateAndSharePdf, generateFichaPdfUri, generateAndShareCurvaPdf } from '../utils/pdfService';
import { findSimilarProducts } from '../utils/productLogic';

const CAPTURE_SCALE = 2;
const CAPTURE_FORMAT = 'jpg';
const CAPTURE_QUALITY = 0.92;

export function useProductDetailLogic({
  modalProd,
  visible,
  activeSliderList,
  pdfCache,
  logoRefreshKey,
  showAlert,
  screenWidth,
  LOGO_BASE
}: any) {
''' + extracted + '''
  return {
    activeTab, setActiveTab,
    generandoPdf, setGenerandoPdf,
    viewerVisible, setViewerVisible,
    activeImgIndex, setActiveImgIndex,
    imgWidth, setImgWidth,
    productImages: Array.from(new set_placeholder).filter((url: any) => {
      const lower = url.toLowerCase();
      return (lower.startsWith('http') || lower.startsWith('file://') || lower.startsWith('content://') || lower.startsWith('data:')) && url.length > 5;
    }),
    productosSimilares, productosMismaMarca, loadingSimilares,
    compartiendo, contentReady, setContentReady,
    showCurveModal, setShowCurveModal,
    sharingCurvaPdf, sharingCurvaImagen,
    curveCaptureRef, curveSize, curveData,
    prevProd, nextProd,
    hiddenPdfRef, pdfUriForImage, setPdfUriForImage,
    handleProbeLayout,
    compartirPdf, compartirImagen, capturarPdfOculto,
    compartirCurvaPdf, compartirCurvaImagen
  };
}
'''
    hook_code = hook_code.replace('new set_placeholder', 'new Set(cleanUrls)')
    
    with open(hookPath, 'w', encoding='utf-8') as f:
        f.write(hook_code)
    
    replace_hook = '''  const {
    activeTab, setActiveTab,
    generandoPdf,
    viewerVisible, setViewerVisible,
    activeImgIndex, setActiveImgIndex,
    imgWidth, setImgWidth,
    productImages,
    productosSimilares, productosMismaMarca, loadingSimilares,
    compartiendo, contentReady, setContentReady,
    showCurveModal, setShowCurveModal,
    sharingCurvaPdf, sharingCurvaImagen,
    curveCaptureRef, curveSize, curveData,
    prevProd, nextProd,
    hiddenPdfRef, pdfUriForImage, setPdfUriForImage,
    handleProbeLayout,
    compartirPdf, compartirImagen, capturarPdfOculto,
    compartirCurvaPdf, compartirCurvaImagen
  } = useProductDetailLogic({
    modalProd, visible, activeSliderList, pdfCache, logoRefreshKey, showAlert, screenWidth, LOGO_BASE
  });

'''
    
    content = content[:s1] + replace_hook + content[s2:]
    content = content.replace("import React, { useState, useRef, useEffect, useMemo } from 'react';", "import React, { useRef } from 'react';\nimport { useProductDetailLogic } from '../hooks/useProductDetailLogic';")
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Extracted hook successfully!")
