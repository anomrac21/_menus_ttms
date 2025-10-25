/**
 * Backend API Endpoint Example - List Icons
 * 
 * This file demonstrates how to implement the /api/list-icons endpoint
 * for the dynamic icon gallery system.
 * 
 * Framework: Express.js (Node.js)
 * You can adapt this for other frameworks/languages
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

/**
 * GET /api/list-icons
 * Returns a list of all available icons organized by category
 */
router.get('/api/list-icons', async (req, res) => {
  try {
    const icons = [];
    
    // Base URL for icons (adjust to your CDN/storage)
    const baseUrl = 'https://ct.ttmenus.com/icons';
    
    // Local path to icons directory (adjust to your setup)
    const iconsBasePath = path.join(__dirname, '..', '_ttms_clienttools', 'icons');
    
    // Categories to scan
    const categories = [
      'food',
      'drink',
      'white',
      'black',
      'activities',
      'utilities',
      'socialmedia'
    ];
    
    // Scan each category directory
    for (const category of categories) {
      const categoryPath = path.join(iconsBasePath, category);
      
      try {
        // Check if directory exists
        const stats = await fs.stat(categoryPath);
        if (!stats.isDirectory()) continue;
        
        // Read all files in the category directory
        const files = await fs.readdir(categoryPath);
        
        // Filter for image files only
        const imageExtensions = ['.webp', '.png', '.jpg', '.jpeg', '.svg', '.gif'];
        const imageFiles = files.filter(file => {
          const ext = path.extname(file).toLowerCase();
          return imageExtensions.includes(ext);
        });
        
        // Add each image to the icons array
        for (const file of imageFiles) {
          const fileName = path.basename(file, path.extname(file));
          
          // Remove 'icon-' prefix if present
          const cleanName = fileName.replace(/^icon-/, '');
          
          // Convert filename to readable name (e.g., 'lunch-special' -> 'Lunch Special')
          const displayName = cleanName
            .split(/[-_]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          
          icons.push({
            url: `${baseUrl}/${category}/${file}`,
            category: category,
            name: displayName
          });
        }
      } catch (dirError) {
        console.warn(`Category directory not found: ${category}`, dirError.message);
        // Continue with other categories
      }
    }
    
    // Sort icons by category, then by name
    icons.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });
    
    // Return the icons list
    res.json({
      success: true,
      count: icons.length,
      icons: icons,
      categories: categories
    });
    
  } catch (error) {
    console.error('Error listing icons:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list icons',
      message: error.message
    });
  }
});

/**
 * Alternative implementation using a static manifest
 * Useful if you want to manually curate the icon list
 */
router.get('/api/list-icons-static', async (req, res) => {
  // Load from a pre-generated JSON file
  const manifestPath = path.join(__dirname, 'icons-manifest.json');
  
  try {
    const manifestData = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestData);
    
    res.json({
      success: true,
      count: manifest.icons.length,
      icons: manifest.icons,
      categories: manifest.categories
    });
  } catch (error) {
    console.error('Error reading icons manifest:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to read icons manifest'
    });
  }
});

/**
 * Python/Flask Example
 * 
 * from flask import Flask, jsonify
 * import os
 * import json
 * 
 * @app.route('/api/list-icons')
 * def list_icons():
 *     icons = []
 *     base_url = 'https://ct.ttmenus.com/icons'
 *     icons_base_path = os.path.join(os.path.dirname(__file__), '..', '_ttms_clienttools', 'icons')
 *     
 *     categories = ['food', 'drink', 'white', 'black', 'activities', 'utilities', 'socialmedia']
 *     
 *     for category in categories:
 *         category_path = os.path.join(icons_base_path, category)
 *         
 *         if not os.path.isdir(category_path):
 *             continue
 *         
 *         for file in os.listdir(category_path):
 *             if file.endswith(('.webp', '.png', '.jpg', '.jpeg', '.svg', '.gif')):
 *                 file_name = os.path.splitext(file)[0]
 *                 clean_name = file_name.replace('icon-', '')
 *                 display_name = ' '.join(word.capitalize() for word in clean_name.split('-'))
 *                 
 *                 icons.append({
 *                     'url': f'{base_url}/{category}/{file}',
 *                     'category': category,
 *                     'name': display_name
 *                 })
 *     
 *     return jsonify({
 *         'success': True,
 *         'count': len(icons),
 *         'icons': icons,
 *         'categories': categories
 *     })
 */

/**
 * PHP Example
 * 
 * <?php
 * header('Content-Type: application/json');
 * 
 * $icons = [];
 * $baseUrl = 'https://ct.ttmenus.com/icons';
 * $iconsBasePath = __DIR__ . '/../_ttms_clienttools/icons';
 * 
 * $categories = ['food', 'drink', 'white', 'black', 'activities', 'utilities', 'socialmedia'];
 * 
 * foreach ($categories as $category) {
 *     $categoryPath = $iconsBasePath . '/' . $category;
 *     
 *     if (!is_dir($categoryPath)) {
 *         continue;
 *     }
 *     
 *     $files = scandir($categoryPath);
 *     
 *     foreach ($files as $file) {
 *         $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
 *         
 *         if (in_array($ext, ['webp', 'png', 'jpg', 'jpeg', 'svg', 'gif'])) {
 *             $fileName = pathinfo($file, PATHINFO_FILENAME);
 *             $cleanName = str_replace('icon-', '', $fileName);
 *             $displayName = ucwords(str_replace(['-', '_'], ' ', $cleanName));
 *             
 *             $icons[] = [
 *                 'url' => "$baseUrl/$category/$file",
 *                 'category' => $category,
 *                 'name' => $displayName
 *             ];
 *         }
 *     }
 * }
 * 
 * echo json_encode([
 *     'success' => true,
 *     'count' => count($icons),
 *     'icons' => $icons,
 *     'categories' => $categories
 * ]);
 * ?>
 */

module.exports = router;



