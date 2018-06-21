import os
import sys
import subprocess

import boto3

REGION = 'eu-west-1'
DIR = os.path.dirname(os.path.abspath(__file__))

session = boto3.Session(profile_name='irdn')
cloudformation = session.client('cloudformation', region_name=REGION)


def update_lambda(zip_name, lambda_function_name):
    client = session.client('lambda', region_name=REGION)
    with open(os.path.join(DIR, '%s.zip' % (zip_name, )), 'rb') as f:
        client.update_function_code(
            FunctionName=lambda_function_name,
            ZipFile=f.read(),
        )
    print('Lambda function %s updated' % (lambda_function_name, ))


def get_stack_name():
    # Meh
    return 'klukka'


def get_outputs(stack_name):
    outputs = cloudformation.describe_stacks(
        StackName=stack_name
    )['Stacks'][0]['Outputs']
    return {
        output['OutputKey']: output['OutputValue']
        for output in outputs
    }


def update_zips():
    p = subprocess.Popen([os.path.join(DIR, 'make-zips.sh')])
    print(p.communicate())
    if p.returncode:
        print('Zip exit with %d' % (p.returncode, ))
        sys.exit(p.returncode)


def write_fn_name(base_api_url):
    with open(os.path.join(DIR, '..', 'src', 'apiConfig.js'), 'w') as f:
        f.write("export default {\n")
        f.write("    gateWayUrl: '%s',\n" % (base_api_url))
        f.write("};\n")


def main():
    stack_name = get_stack_name()
    outputs = get_outputs(stack_name)
    skyrsla_fn_name = outputs['SkyrslaFunctionName']
    ruv_fn_name = outputs['RuvFunctionName']
    base_api_url = outputs['ApiGatewayUrl']
    update_zips()
    update_lambda('skyrsla', skyrsla_fn_name)
    update_lambda('ruv', ruv_fn_name)
    write_fn_name(base_api_url)


if __name__ == '__main__':
    main()
