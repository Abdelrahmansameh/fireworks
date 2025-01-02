import os
import glob

def concatenate_js_files(project_root, output_file):
    """
    Concatenate all JavaScript files in the project into a single file.
    
    Args:
        project_root (str): Root directory of the project to search for JS files
        output_file (str): Path to the output concatenated file
    """
    js_files = glob.glob(os.path.join(project_root, '**', '*.js'), recursive=True)
    
    js_files.sort()
    
    with open(output_file, 'w', encoding='utf-8') as outfile:
        outfile.write('// Concatenated JavaScript Files\n')
        outfile.write('// Generated on: 2025-01-02\n\n')
        
        for js_file in js_files:
            relative_path = os.path.relpath(js_file, project_root)
            outfile.write(f'// File: {relative_path}\n')
            
            with open(js_file, 'r', encoding='utf-8') as infile:
                outfile.write(infile.read())
                outfile.write('\n\n')
        
        print(f'Successfully concatenated {len(js_files)} JavaScript files to {output_file}')

def main():
    project_root = r'c:/Users/Abdel/fireworkswindsurf/js'
    
    output_file = r'c:/Users/Abdel/fireworkswindsurf/tools/all_js_files_concatenated.js'
    
    concatenate_js_files(project_root, output_file)

if __name__ == '__main__':
    main()
